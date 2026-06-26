import { format } from 'date-fns';
import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../state/AppContext';
import {
  db,
  deleteOverride,
  exportAll,
  importAll,
  putOverride,
  putPeriod,
  requestPersistentStorage,
} from '../db';
import { computeStatus, effectiveConfirmEnd } from '../domain/calc';
import { usePeriodDays } from '../hooks/useStatus';
import { parseDay, todayStr } from '../domain/time';
import type {
  BackupPayload,
  BreakHandling,
  HolidayOverride,
  InputMethod,
  Period,
  RequiredHoursMode,
  Settings,
} from '../types';

// Editable draft of the basic settings. Numbers are kept as strings so a field
// can be cleared and retyped freely (no "0" prefix while typing). Committed on
// the explicit 保存 button.
interface Draft {
  dailyStandardHours: string;
  requiredHoursMode: RequiredHoursMode;
  manualRequiredHours: string;
  periodStartDay: string;
  paidLeaveHours: string;
  breakHandling: BreakHandling;
  defaultInputMethod: InputMethod;
  workStartTime: string;
  saturday: boolean;
  sunday: boolean;
  nationalHoliday: boolean;
  assumeStandardForElapsed: boolean;
}

function fromSettings(s: Settings): Draft {
  return {
    dailyStandardHours: String(s.dailyStandardHours),
    requiredHoursMode: s.requiredHoursMode,
    manualRequiredHours: s.manualRequiredHours == null ? '' : String(s.manualRequiredHours),
    periodStartDay: String(s.periodStartDay),
    paidLeaveHours: String(s.paidLeaveHours),
    breakHandling: s.breakHandling,
    defaultInputMethod: s.defaultInputMethod === 'timer' ? 'time' : s.defaultInputMethod,
    workStartTime: s.workStartTime,
    saturday: s.holidayRule.saturday,
    sunday: s.holidayRule.sunday,
    nationalHoliday: s.holidayRule.nationalHoliday,
    assumeStandardForElapsed: s.assumeStandardForElapsed,
  };
}

function num(v: string, fallback: number): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

export function SettingsPage() {
  const { settings, updateSettings, holidayCtx, period, today } = useApp();
  const days = usePeriodDays();
  const overrides = useLiveQuery(() => db.holidayOverrides.orderBy('date').toArray(), [], []);
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string>('');

  const [draft, setDraft] = useState<Draft>(() => fromSettings(settings));
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const [ovDate, setOvDate] = useState(today);
  const [ovType, setOvType] = useState<'add' | 'remove'>('add');
  const [ovLabel, setOvLabel] = useState('');

  async function saveSettingsDraft() {
    await updateSettings({
      dailyStandardHours: num(draft.dailyStandardHours, settings.dailyStandardHours),
      requiredHoursMode: draft.requiredHoursMode,
      manualRequiredHours: draft.manualRequiredHours === '' ? null : num(draft.manualRequiredHours, 0),
      periodStartDay: Math.min(28, Math.max(1, Math.round(num(draft.periodStartDay, 1)))),
      paidLeaveHours: num(draft.paidLeaveHours, settings.paidLeaveHours),
      breakHandling: draft.breakHandling,
      defaultInputMethod: draft.defaultInputMethod,
      workStartTime: draft.workStartTime,
      holidayRule: {
        saturday: draft.saturday,
        sunday: draft.sunday,
        nationalHoliday: draft.nationalHoliday,
      },
      assumeStandardForElapsed: draft.assumeStandardForElapsed,
    });
    setMsg('設定を保存しました。');
  }

  async function addOverride() {
    const o: HolidayOverride = { date: ovDate, type: ovType, label: ovLabel || undefined };
    await putOverride(o);
    setOvLabel('');
  }

  async function doExport() {
    const payload = await exportAll(new Date().toISOString());
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flex-backup-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function doImport(file: File) {
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as BackupPayload;
      await importAll(payload);
      setMsg('インポートしました。再読み込みします…');
      setTimeout(() => location.reload(), 800);
    } catch (e) {
      setMsg('インポート失敗: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function closePeriod() {
    const confEnd = effectiveConfirmEnd(settings, today);
    const status = computeStatus({ settings, range: period, days, ctx: holidayCtx, today, confEnd });
    const p: Period = {
      id: period.id,
      startDate: period.startDate,
      endDate: period.endDate,
      status: 'closed',
      snapshot: {
        requiredMinutes: status.requiredMinutes,
        workingDays: status.workingDays,
        dailyStandardHours: settings.dailyStandardHours,
        actualMinutes: status.actualMinutes,
      },
    };
    await putPeriod(p);
    setMsg(`期間 ${period.startDate} を確定スナップショットとして保存しました。`);
  }

  async function persist() {
    const ok = await requestPersistentStorage();
    setMsg(ok ? 'このサイトのデータは永続化されました。' : '永続化は許可されませんでした（後で再要求されます）。');
  }

  return (
    <>
      <div className="page-title">設定</div>

      <div className="card">
        <div className="field">
          <label>1日の所定労働時間（時間）</label>
          <input
            type="number"
            step="0.25"
            value={draft.dailyStandardHours}
            onChange={(e) => set('dailyStandardHours', e.target.value)}
          />
        </div>

        <div className="field">
          <label>勤務開始時刻（入力の初期値）</label>
          <input type="time" value={draft.workStartTime} onChange={(e) => set('workStartTime', e.target.value)} />
        </div>

        <div className="field">
          <label>月の必要時間</label>
          <select
            value={draft.requiredHoursMode}
            onChange={(e) => set('requiredHoursMode', e.target.value as RequiredHoursMode)}
          >
            <option value="auto">自動（所定時間 × 稼働日数）</option>
            <option value="manual">手動指定</option>
          </select>
        </div>
        {draft.requiredHoursMode === 'manual' && (
          <div className="field">
            <label>必要時間（時間）</label>
            <input
              type="number"
              step="1"
              value={draft.manualRequiredHours}
              onChange={(e) => set('manualRequiredHours', e.target.value)}
            />
          </div>
        )}

        <div className="field">
          <label>清算期間の起算日（締め日, 1〜28）</label>
          <input
            type="number"
            min="1"
            max="28"
            value={draft.periodStartDay}
            onChange={(e) => set('periodStartDay', e.target.value)}
          />
        </div>

        <div className="field">
          <label>有給のみなし時間（時間）</label>
          <input
            type="number"
            step="0.25"
            value={draft.paidLeaveHours}
            onChange={(e) => set('paidLeaveHours', e.target.value)}
          />
        </div>

        <div className="field">
          <label>休憩の扱い</label>
          <select
            value={draft.breakHandling}
            onChange={(e) => set('breakHandling', e.target.value as BreakHandling)}
          >
            <option value="gap">時間帯の間を休憩とする（自動控除なし）</option>
            <option value="auto-deduct">法定休憩を自動控除（6h超45分 / 8h超60分）</option>
          </select>
        </div>

        <div className="field">
          <label>既定の入力方式</label>
          <select
            value={draft.defaultInputMethod}
            onChange={(e) => set('defaultInputMethod', e.target.value as InputMethod)}
          >
            <option value="time">時刻入力</option>
            <option value="total">合計入力</option>
          </select>
        </div>

        <div className="section-head" style={{ margin: '6px 0 6px' }}>勤務時間のみなし</div>
        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0 8px' }}>
          <span>未記録の過去平日を所定時間とみなす</span>
          <input
            type="checkbox"
            checked={draft.assumeStandardForElapsed}
            onChange={(e) => set('assumeStandardForElapsed', e.target.checked)}
          />
        </label>
        <p className="hint" style={{ marginTop: 0 }}>
          ONにすると、平日は黙っていれば所定時間はたらいた扱いになり、有給・欠勤・早退・残業など
          「何かあった日」だけ記録すれば過不足がプラマイ動きます。記録はいつでも編集できます（仮/確定の区別なし）。
        </p>

        <div className="section-head" style={{ margin: '6px 0 6px' }}>休日</div>
        {([
          ['saturday', '土曜を休日'],
          ['sunday', '日曜を休日'],
          ['nationalHoliday', '祝日を休日'],
        ] as const).map(([k, label]) => (
          <label key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
            <span>{label}</span>
            <input type="checkbox" checked={draft[k]} onChange={(e) => set(k, e.target.checked)} />
          </label>
        ))}

        <button className="btn" style={{ marginTop: 8 }} onClick={() => void saveSettingsDraft()}>
          設定を保存
        </button>
      </div>

      <div className="section-head">個別の休日（追加 / 解除）</div>
      <div className="card">
        <div className="inline-fields" style={{ marginBottom: 10 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>日付</label>
            <input type="date" value={ovDate} onChange={(e) => setOvDate(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>種別</label>
            <select value={ovType} onChange={(e) => setOvType(e.target.value as 'add' | 'remove')}>
              <option value="add">休日にする</option>
              <option value="remove">休日から外す</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label>ラベル（任意）</label>
          <input value={ovLabel} onChange={(e) => setOvLabel(e.target.value)} placeholder="会社休日など" />
        </div>
        <button className="btn btn--ghost btn--sm" onClick={() => void addOverride()}>
          追加
        </button>

        {(overrides ?? []).length > 0 && (
          <div style={{ marginTop: 12 }}>
            {(overrides ?? []).map((o) => (
              <div className="list-item" key={o.date}>
                <span>
                  {format(parseDay(o.date), 'M/d')}{' '}
                  <span className="badge">{o.type === 'add' ? '休日に' : '休日解除'}</span>{' '}
                  {o.label}
                </span>
                <button className="btn btn--ghost btn--sm" onClick={() => void deleteOverride(o.date)}>
                  削除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="section-head">清算期間</div>
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          現在の期間: {period.startDate} 〜 {period.endDate}
        </p>
        <button className="btn btn--ghost btn--sm" onClick={() => void closePeriod()}>
          この期間を確定（スナップショット保存）
        </button>
      </div>

      <div className="section-head">バックアップ</div>
      <div className="card">
        <button className="btn btn--ghost" onClick={() => void doExport()}>
          JSON をエクスポート
        </button>
        <button className="btn btn--ghost" style={{ marginTop: 10 }} onClick={() => fileRef.current?.click()}>
          JSON をインポート
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void doImport(f);
            e.target.value = '';
          }}
        />
        <button className="btn btn--ghost" style={{ marginTop: 10 }} onClick={() => void persist()}>
          データの永続化を要求
        </button>
        {msg && <p className="hint" style={{ marginTop: 12 }}>{msg}</p>}
      </div>

      <p className="hint" style={{ textAlign: 'center', marginTop: 20 }}>
        フレックス勤務トラッカー · データはこの端末のブラウザ内にのみ保存されます
      </p>
    </>
  );
}

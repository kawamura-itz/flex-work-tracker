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
import { addDaysStr, parseDay, todayStr } from '../domain/time';
import type { BackupPayload, HolidayOverride, Period } from '../types';

export function SettingsPage() {
  const { settings, updateSettings, holidayCtx, period, today } = useApp();
  const days = usePeriodDays();
  const overrides = useLiveQuery(() => db.holidayOverrides.orderBy('date').toArray(), [], []);
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string>('');

  const [ovDate, setOvDate] = useState(today);
  const [ovType, setOvType] = useState<'add' | 'remove'>('add');
  const [ovLabel, setOvLabel] = useState('');

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
            value={settings.dailyStandardHours}
            onChange={(e) => void updateSettings({ dailyStandardHours: parseFloat(e.target.value) || 0 })}
          />
        </div>

        <div className="field">
          <label>月の必要時間</label>
          <select
            value={settings.requiredHoursMode}
            onChange={(e) => void updateSettings({ requiredHoursMode: e.target.value as 'auto' | 'manual' })}
          >
            <option value="auto">自動（所定時間 × 稼働日数）</option>
            <option value="manual">手動指定</option>
          </select>
        </div>
        {settings.requiredHoursMode === 'manual' && (
          <div className="field">
            <label>必要時間（時間）</label>
            <input
              type="number"
              step="1"
              value={settings.manualRequiredHours ?? ''}
              onChange={(e) =>
                void updateSettings({ manualRequiredHours: e.target.value === '' ? null : parseFloat(e.target.value) })
              }
            />
          </div>
        )}

        <div className="field">
          <label>清算期間の起算日（締め日, 1〜28）</label>
          <input
            type="number"
            min="1"
            max="28"
            value={settings.periodStartDay}
            onChange={(e) =>
              void updateSettings({ periodStartDay: Math.min(28, Math.max(1, parseInt(e.target.value) || 1)) })
            }
          />
        </div>

        <div className="field">
          <label>有給のみなし時間（時間）</label>
          <input
            type="number"
            step="0.25"
            value={settings.paidLeaveHours}
            onChange={(e) => void updateSettings({ paidLeaveHours: parseFloat(e.target.value) || 0 })}
          />
        </div>

        <div className="field">
          <label>休憩の扱い</label>
          <select
            value={settings.breakHandling}
            onChange={(e) => void updateSettings({ breakHandling: e.target.value as 'auto-deduct' | 'gap' })}
          >
            <option value="gap">セグメントの間を休憩とする（自動控除なし）</option>
            <option value="auto-deduct">法定休憩を自動控除（6h超45分 / 8h超60分）</option>
          </select>
        </div>

        <div className="field">
          <label>既定の入力方式</label>
          <select
            value={settings.defaultInputMethod}
            onChange={(e) => void updateSettings({ defaultInputMethod: e.target.value as 'timer' | 'time' | 'total' })}
          >
            <option value="timer">タイマー</option>
            <option value="time">時刻入力</option>
            <option value="total">合計入力</option>
          </select>
        </div>
      </div>

      <div className="section-head">勤務時間のみなし</div>
      <div className="card">
        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0 10px' }}>
          <span>未記録の過去平日を所定時間とみなす</span>
          <input
            type="checkbox"
            checked={settings.assumeStandardForElapsed}
            onChange={(e) => void updateSettings({ assumeStandardForElapsed: e.target.checked })}
          />
        </label>
        <p className="hint" style={{ marginTop: 0 }}>
          ONにすると、平日は黙っていれば所定時間はたらいた扱いになり、有給・欠勤・早退・残業など
          「何かあった日」だけ記録すれば過不足がプラマイ動きます。
        </p>

        {settings.assumeStandardForElapsed && (
          <>
            <div className="field" style={{ marginTop: 6 }}>
              <label>確定日（この日までの空欄平日をみなし算入）</label>
              <input
                type="date"
                value={settings.confirmedThrough ?? addDaysStr(today, -1)}
                max={today}
                onChange={(e) => void updateSettings({ confirmedThrough: e.target.value || null })}
              />
            </div>
            <div className="inline-fields" style={{ gap: 8 }}>
              <button className="btn btn--ghost btn--sm" onClick={() => void updateSettings({ confirmedThrough: today })}>
                今日まで確定
              </button>
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => void updateSettings({ confirmedThrough: addDaysStr(today, -1) })}
              >
                昨日まで
              </button>
              <button className="btn btn--ghost btn--sm" onClick={() => void updateSettings({ confirmedThrough: null })}>
                自動（昨日まで）
              </button>
            </div>
            <p className="hint">
              確定日より後〜今日より前の未記録平日は「未確定（0扱い）」となり、入力し忘れを警告します。
            </p>
          </>
        )}
      </div>

      <div className="section-head">休日設定</div>
      <div className="card">
        {(['saturday', 'sunday', 'nationalHoliday'] as const).map((k) => (
          <label key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
            <span>{k === 'saturday' ? '土曜を休日' : k === 'sunday' ? '日曜を休日' : '祝日を休日'}</span>
            <input
              type="checkbox"
              checked={settings.holidayRule[k]}
              onChange={(e) =>
                void updateSettings({ holidayRule: { ...settings.holidayRule, [k]: e.target.checked } })
              }
            />
          </label>
        ))}
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

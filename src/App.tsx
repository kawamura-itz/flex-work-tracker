import { NavLink, Route, Routes } from 'react-router-dom';
import { MainPage } from './pages/MainPage';
import { DayInputPage } from './pages/DayInputPage';
import { SimulationPage } from './pages/SimulationPage';
import { SettingsPage } from './pages/SettingsPage';
import { HistoryPage } from './pages/HistoryPage';

const NAV = [
  { to: '/', label: 'メイン', ico: '⚖️', end: true },
  { to: '/input', label: '入力', ico: '✏️', end: false },
  { to: '/sim', label: '試算', ico: '🔮', end: false },
  { to: '/history', label: '履歴', ico: '🗂️', end: false },
  { to: '/settings', label: '設定', ico: '⚙️', end: false },
];

export function App() {
  return (
    <div className="app">
      <main className="app__main">
        <Routes>
          <Route path="/" element={<MainPage />} />
          <Route path="/input" element={<DayInputPage />} />
          <Route path="/input/:date" element={<DayInputPage />} />
          <Route path="/sim" element={<SimulationPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
      <nav className="nav">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="ico">{n.ico}</span>
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

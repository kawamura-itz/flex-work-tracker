import { useNavigate, useParams } from 'react-router-dom';
import { DayEditor } from '../components/DayEditor';
import { useApp } from '../state/AppContext';

/** Full-page day editor, kept for deep links (/input/:date). */
export function DayInputPage() {
  const { today } = useApp();
  const navigate = useNavigate();
  const { date } = useParams();
  return <DayEditor date={date ?? today} onClose={() => navigate('/')} />;
}

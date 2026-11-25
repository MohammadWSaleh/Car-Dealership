import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import EnquiryForm from '../components/EnquiryForm.jsx';

// FR-OC-02: the member's referral link opens this page with the code filled in
export default function Refer() {
  const { code } = useParams(); const { t } = useTranslation();
  return <div className="mx-auto max-w-2xl space-y-4"><div className="rounded-2xl bg-brand-50 p-5"><h1 className="text-2xl font-bold">{t('refer.title')}</h1><p className="text-slate-700">{t('refer.text')}</p></div><div className="card"><EnquiryForm referral={String(code || '').toUpperCase()} /></div></div>;
}

import { redirect } from 'next/navigation';

export default function ProtectedHomeRedirect() {
  redirect('/analytics/campaign-reporting');
}


import { ArrowUpRight } from 'lucide-react';
import AdminLayout from '../../components/admin/AdminLayout';

export default function PlatformTools() {
  return <AdminLayout>
    <section className="ll-platform-tools-intro">
      <p className="ll-kicker">Platform tools</p>
      <h2>Choose what you need.</h2>
      <p>Review projects, private inquiries, moderation, taxonomy, or Creative access from the tools above.</p>
      <span><ArrowUpRight size={17}/> Your public website remains the main editing view.</span>
    </section>
  </AdminLayout>;
}

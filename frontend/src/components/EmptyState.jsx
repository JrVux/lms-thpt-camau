import IconBadge from './IconBadge';
import { Inbox } from 'lucide-react';

const EmptyState = ({ icon = Inbox, color = 'blue', title, description, action }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <IconBadge icon={icon} color={color} size={12} className="mb-4" />
    <p className="text-base font-medium text-brand-heading">{title}</p>
    {description && <p className="mt-1 text-sm text-brand-muted">{description}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);
export default EmptyState;
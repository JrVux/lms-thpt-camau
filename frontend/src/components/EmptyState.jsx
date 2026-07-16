const EmptyState = ({ icon = '📭', title, description, action }) => (
  <div className="flex flex-col items-center justify-center py-16 text-gray-400">
    <span className="text-4xl mb-3">{icon}</span>
    <p className="text-lg font-medium text-gray-500">{title}</p>
    {description && <p className="text-sm mt-1">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);
export default EmptyState;

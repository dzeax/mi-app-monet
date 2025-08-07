export default function Home() {
  const campaigns = [
    { name: 'Spring Sale', emailsSent: 1200, openRate: 35, clickRate: 8 },
    { name: 'Welcome Series', emailsSent: 500, openRate: 45, clickRate: 10 },
    { name: 'Re-engagement', emailsSent: 800, openRate: 22, clickRate: 2 },
  ];

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold mb-6">Email Campaigns</h1>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Emails Sent</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Open Rate</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Click Rate</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {campaigns.map((campaign) => (
              <tr key={campaign.name}>
                <td className="px-4 py-2 whitespace-nowrap">{campaign.name}</td>
                <td className="px-4 py-2 whitespace-nowrap">{campaign.emailsSent}</td>
                <td className="px-4 py-2 whitespace-nowrap">{campaign.openRate}%</td>
                <td className="px-4 py-2 whitespace-nowrap">{campaign.clickRate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

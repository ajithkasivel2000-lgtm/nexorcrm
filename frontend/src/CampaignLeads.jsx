import { useCallback, useMemo } from 'react';
import LeadListPage from './components/LeadListPage';
import { campaignOf, isCampaignLead, messageOf } from './utils/campaignLead';
import { Pill } from './ui';

/**
 * Leads captured from marketing campaigns.
 *
 * There is no server-side campaign filter, so this loads all leads the user can
 * see and narrows to the campaign ones client-side — see utils/campaignLead.js
 * for how they are recognised.
 */
export default function CampaignLeads() {
  const filterRows = useCallback((rows) => rows.filter(isCampaignLead), []);

  const extraColumns = useMemo(() => ([
    {
      key: 'campaign',
      label: 'Campaign',
      width: '190px',
      render: (lead) => {
        const name = campaignOf(lead);
        return name
          ? <Pill tone="accent">{name}</Pill>
          : <span className="nx-page__muted">Unnamed</span>;
      },
      sortValue: campaignOf,
      exportValue: campaignOf,
    },
    {
      key: 'message',
      label: 'Message',
      sortable: false,
      render: (lead) => {
        const text = messageOf(lead);
        return text
          ? <span className="nx-page__clamp" title={text}>{text}</span>
          : '—';
      },
      exportValue: messageOf,
    },
  ]), []);

  return (
    <LeadListPage
      title="Campaign Leads"
      subtitle="Leads captured from marketing campaigns through your public campaign links."
      exportName="campaign-leads"
      filterRows={filterRows}
      extraColumns={extraColumns}
      filters={['campaign', 'primarySource', 'project', 'status', 'owner']}
      emptyMessage="No campaign leads yet"
    />
  );
}

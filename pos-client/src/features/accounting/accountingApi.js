import { api } from '../../app/baseApi';

export const accountingApi = api.injectEndpoints({
  endpoints: b => ({
    getAccounts:      b.query({ query: () => '/accounting/accounts', providesTags: ['Accounts'] }),
    createAccount:    b.mutation({ query: body => ({ url: '/accounting/accounts', method: 'POST', body }), invalidatesTags: ['Accounts'] }),
    updateAccount:    b.mutation({ query: ({ id, ...body }) => ({ url: `/accounting/accounts/${id}`, method: 'PUT', body }), invalidatesTags: ['Accounts'] }),
    getEntries:       b.query({ query: p => ({ url: '/accounting/entries', params: p }), providesTags: ['JournalEntries'] }),
    createEntry:      b.mutation({ query: body => ({ url: '/accounting/entries', method: 'POST', body }), invalidatesTags: ['JournalEntries'] }),
    deleteEntry:      b.mutation({ query: id => ({ url: `/accounting/entries/${id}`, method: 'DELETE' }), invalidatesTags: ['JournalEntries'] }),
    getTrialBalance:          b.query({ query: p => ({ url: '/accounting/trial-balance', params: p }), providesTags: ['TrialBalance'] }),
    getStockValue:            b.query({ query: () => '/accounting/stock-value' }),
    getOpeningBalanceStatus:  b.query({ query: () => '/accounting/opening-balance-status', providesTags: ['OpeningBalance'] }),
    createOpeningBalance:     b.mutation({ query: body => ({ url: '/accounting/opening-balance', method: 'POST', body }), invalidatesTags: ['JournalEntries', 'TrialBalance', 'OpeningBalance'] }),
  }),
  overrideExisting: false,
});

export const {
  useGetAccountsQuery,
  useCreateAccountMutation,
  useUpdateAccountMutation,
  useGetEntriesQuery,
  useCreateEntryMutation,
  useDeleteEntryMutation,
  useGetTrialBalanceQuery,
  useGetStockValueQuery,
  useGetOpeningBalanceStatusQuery,
  useCreateOpeningBalanceMutation,
} = accountingApi;

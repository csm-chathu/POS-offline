import { api } from '../../app/baseApi';

export const extensionsApi = api.injectEndpoints({
  endpoints: b => ({
    getExtensions:       b.query({ query: () => '/extensions', providesTags: ['Extensions'] }),
    toggleExtension:     b.mutation({ query: ({ key }) => ({ url: `/extensions/${key}/toggle`, method: 'POST' }), invalidatesTags: ['Extensions'] }),
    configureExtension:  b.mutation({ query: ({ key, config }) => ({ url: `/extensions/${key}/configure`, method: 'POST', body: { config } }), invalidatesTags: ['Extensions'] }),
    getExtensionConfig:  b.query({ query: key => `/extensions/${key}/config`, providesTags: (r, e, key) => [{ type: 'Extensions', id: key }] }),
    sendSmsReceipt:      b.mutation({ query: body => ({ url: '/extensions/sms_receipt/send', method: 'POST', body }) }),
  }),
  overrideExisting: false,
});

export const {
  useGetExtensionsQuery,
  useToggleExtensionMutation,
  useConfigureExtensionMutation,
  useGetExtensionConfigQuery,
  useSendSmsReceiptMutation,
} = extensionsApi;

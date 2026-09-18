import { api } from '../../app/baseApi';

const rolesApi = api.injectEndpoints({
  endpoints: b => ({
    getRoles:    b.query({ query: () => '/roles',          providesTags: ['Roles'] }),
    getFeatures: b.query({ query: () => '/roles/features', providesTags: ['Features'] }),

    createRole: b.mutation({
      query: ({ name }) => ({ url: '/roles', method: 'POST', body: { name } }),
      invalidatesTags: ['Roles'],
    }),
    updateRole: b.mutation({
      query: ({ id, name }) => ({ url: `/roles/${id}`, method: 'PUT', body: { name } }),
      invalidatesTags: ['Roles'],
    }),
    deleteRole: b.mutation({
      query: ({ id }) => ({ url: `/roles/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Roles'],
    }),
    setRoleFeatures: b.mutation({
      query: ({ id, features }) => ({ url: `/roles/${id}/features`, method: 'PUT', body: { features } }),
      invalidatesTags: ['Roles'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetRolesQuery,
  useGetFeaturesQuery,
  useCreateRoleMutation,
  useUpdateRoleMutation,
  useDeleteRoleMutation,
  useSetRoleFeaturesMutation,
} = rolesApi;

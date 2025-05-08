// Types for Signup Link structure used in admin/locations

export interface SignupLink {
  id: string;
  token: string;
  locationId: string;
  yearId: string;
  active: boolean;
  location: {
    id: string;
    name: string;
    slug: string;
    organizationId: string;
  };
  year: {
    id: string;
    name: string;
    active: boolean;
  };
}

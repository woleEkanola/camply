// Types for Signup Link structure used in admin/campuses

export interface SignupLink {
  id: string;
  token: string;
  campusId: string;
  campId: string;
  active: boolean;
  campus: {
    id: string;
    name: string;
    slug: string;
    organizationId: string;
  };
  camp: {
    id: string;
    name: string;
    slug: string;
    active: boolean;
  };
}

export type CustomerOption = {
  id: string;
  name: string | null;
  phone: string | null;
};

export type JobOption = {
  id: string;
  title: string | null;
  customer_id: string | null;
};

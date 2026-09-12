export type HomeDocumentEntry = {
  id: string;
  date: string;
  documentType: string;
  title: string;
  issuer?: string;
  issueDate?: string;
  expiryDate?: string;
};

export type HomeExpenseEntry = {
  id: string;
  date: string;
  category: string;
  title: string;
  amount: number;
  notes?: string;
};

export type HomeMaintenanceEntry = {
  id: string;
  date: string;
  service: string;
  description: string;
  price: number;
  provider?: string;
  nextDueDate?: string;
};

export type HomeRecurringEntry = {
  id: string;
  title: string;
  category: string;
  amount: number;
  frequency: "weekly" | "monthly" | "yearly";
  nextDueDate: string;
  notes?: string;
};

export type HomeSupplyEntry = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  lastRestockedDate?: string;
  notes?: string;
};
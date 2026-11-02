import type { Models } from 'react-native-appwrite';

export type Product = Models.Row & {
  name: string;
  slug: string;
  brand?: string;
  category: string;
  description?: string;
  priceCents: number;
  compareAtCents?: number | null;
  imageUrl?: string;
  rating?: number;
  stock: number;
  concerns?: string[];
  skinTypes?: string[];
  featured?: boolean;
};

export type CartItem = {
  productId: string;
  qty: number;
  // Display snapshot only. The server re-prices every order from the products table.
  name: string;
  priceCents: number;
  imageUrl?: string;
};

export type ScanRow = Models.Row & {
  userId: string;
  status: 'processing' | 'complete' | 'error';
  fileId?: string;
  payloadEnc?: string | null;
  error?: string | null;
};

export type ConcernScore = { key: string; score: number; raw?: number | null };

export type SkinType = {
  label: string; // e.g. "Combination & Redness-prone"
  base: 'normal' | 'oily' | 'dry' | 'combination';
  sensitive: boolean;
  source: 'youcam' | 'estimated';
  zones?: { t_zone?: string; u_zone?: string };
};

export type ScanMode = 'sd' | 'hd';

export type ScanResult = {
  mode?: ScanMode;
  overall: number;
  skinAge: number | null;
  skinType?: SkinType | null;
  concerns: ConcernScore[];
  analyzedAt: string;
};

export type OrderLine = { productId: string; name: string; imageUrl?: string; priceCents: number; qty: number };

export type OrderRow = Models.Row & {
  userId: string;
  status: 'placed' | 'packed' | 'shipped' | 'delivered' | 'cancelled';
  itemsJson: string;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  shippingEnc: string;
};

export type ShippingAddress = {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
  phone?: string;
};

export type EventRow = Models.Row & {
  type: 'order_placed' | 'scan_completed' | 'signup';
  day: string;
  amountCents?: number | null;
  units?: number | null;
  dataJson?: string | null;
};

export type SupportMessage = Models.Row & {
  userId: string;
  role: 'user' | 'assistant' | 'agent' | 'system';
  body: string;
  ticketId?: string | null;
  agentName?: string | null;
};

export type Ticket = Models.Row & {
  userId: string;
  userName?: string | null;
  userEmail?: string | null;
  category: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'open' | 'pending' | 'resolved';
  subject?: string | null;
  summary?: string | null;
  lastMessage?: string | null;
  assignee?: string | null;
};

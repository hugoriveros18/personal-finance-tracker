export type Language = 'es' | 'en';
export type ThemeMode = 'light' | 'dark';
export type CategoryTipo = 'ingreso' | 'egreso';
export type TransactionTipo = 'ingreso' | 'egreso' | 'pasivo';
export type MovementFlujo =
  | 'INTER_DISPONIBLE'
  | 'INTRA_DISPONIBLE_TO_AHORRO'
  | 'INTRA_AHORRO_TO_DISPONIBLE';

export interface User {
  id: string;
  nombre: string;
  apellidos: string;
  email: string;
  avatarPath: string | null;
  preferredLanguage: Language;
  preferredTheme: ThemeMode;
}

export interface Category {
  id: string;
  nombre: string;
  tipo: CategoryTipo;
  createdAt: string;
  updatedAt: string;
}

export interface Account {
  id: string;
  nombre: string;
  disponible: number;
  ahorro: number;
  pasivos: number;
  total: number;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  accountId: string;
  categoryId: string;
  categoryTipo: CategoryTipo;
  descripcion: string;
  fecha: string;
  tipo: TransactionTipo;
  valor: number;
  createdAt: string;
  updatedAt: string;
}

export interface Movement {
  id: string;
  cuentaEmisoraId: string;
  cuentaReceptoraId: string;
  flujo: MovementFlujo;
  descripcion: string;
  fecha: string;
  valor: number;
  createdAt: string;
  updatedAt: string;
}

export interface LiabilityPayment {
  id: string;
  accountId: string;
  descripcion: string;
  fecha: string;
  valor: number;
  createdAt: string;
  updatedAt: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  totals?: Record<string, number>;
}

'use client';
import type {
  EcotrackCatalogResponse,
  EcotrackShipmentSortDirection,
  EcotrackShipmentSortKey,
  EcotrackShipmentsResponse,
} from '../../../lib/ecotrack-admin-contracts';

export type SortKey = EcotrackShipmentSortKey;

export type SortDirection = EcotrackShipmentSortDirection;

export type OrdersEcotrackManagerProps = {
  initialOrders?: EcotrackShipmentsResponse;
  initialCatalog?: EcotrackCatalogResponse;
};

export type RowPrimaryAction = {
  label: string;
  icon: React.ReactNode;
  onPrimaryClick: () => void | Promise<void>;
};

export const ECOTRACK_STATUSES = [
  'prete_a_expedier',
  'en_ramassage',
  'en_preparation_stock',
  'vers_hub',
  'en_hub',
  'vers_wilaya',
  'en_preparation',
  'en_livraison',
  'suspendu',
  'livre_non_encaisse',
  'encaisse_non_paye',
  'paiements_prets',
  'payed',
  'paye_et_archive',
  'retour_chez_livreur',
  'retour_transit_entrepot',
  'retour_en_traitement',
  'retour_recu',
  'retour_archive',
  'annule',
] as const;

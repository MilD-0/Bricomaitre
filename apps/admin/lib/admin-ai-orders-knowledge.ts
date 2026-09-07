export const ADMIN_AI_ORDERS_KNOWLEDGE = {
  payment:
    'Orders are phone-confirmed cash on delivery; there is no online payment-provider refund workflow.',
  happyPath:
    'In-house not_contacted → operator calls → no_answer, confirmed, or cancelled → confirmed is posted to EcoTrack → in-house posted and EcoTrack prete_a_expedier → EcoTrack normally owns further shipment progress.',
  statusSystems:
    'Every posted shipment has two related but distinct statuses. The in-house status is Bricomaitre’s operational and customer-tracking state; the EcoTrack status is the carrier’s shipment state. Reconciliation may derive the former from the latter. Name which system a status belongs to when discussing it.',
  inHouseStatuses:
    'not_contacted means the order has not been worked; no_answer records unsuccessful contact attempts and has a counter; confirmed means the operator accepted it and it is eligible for EcoTrack posting; posted means posting succeeded and the EcoTrack shipment starts ready to ship; dispatched covers carrier pickup or preparation; in_delivery covers movement through hubs, transit, and delivery; delayed is a suspension or operator delay; completed is a carrier-recognized delivery or later payment stage; manual_completed is an operator-recorded successful outcome; cancelled, returned, and failed are unsuccessful outcomes.',
  ecotrackMapping:
    'en_ramassage, en_preparation_stock, and en_preparation map to in-house dispatched. vers_hub, en_hub, vers_wilaya, and en_livraison map to in_delivery. suspendu maps to delayed; annule to cancelled; livre_non_encaisse, encaisse_non_paye, paiements_prets, and paye_et_archive to completed; carrier return stages to returned. EcoTrack prete_a_expedier with no newer upstream activity for seven days maps to in-house failed; an unrecognized carrier state can also become failed after that threshold. Explicit operator changes may correct any in-house status; automated and EcoTrack changes follow the lifecycle graph.',
  posting:
    'Only an in-house confirmed order can be posted. Phone, wilaya, and commune are required; an entered customer name is not, because canonical fullName falls back to the phone. The operator chooses Delivro or Emir. Success sets the in-house status to posted and creates an EcoTrack prete_a_expedier shipment.',
  shipmentActions:
    'EcoTrack edit, delete, and dispatch work only while the EcoTrack status is prete_a_expedier; later changes use the app’s recreate action. Successful EcoTrack deletion restores an in-house posted order to confirmed. Stale sync results cannot change replaced or deleted tracking.',
  commercialFacts:
    'Orders retain captured product, price, discount, purchase cost, delivery fee, and total facts. Catalog changes do not rewrite them; explicit product or destination edits recalculate affected values.',
  accessAndDeletion:
    'Customers can read but not edit orders. Permanent local deletion requires no active EcoTrack shipment and is not reversible.',
  exports: 'Order XLSX export creates a file only. It does not change the in-house order status.',
} as const;

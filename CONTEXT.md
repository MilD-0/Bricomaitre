# Bricomaitre domain language

Bricomaitre comprises a Customer Storefront and a Commerce Operating System. Use these terms consistently in code, interfaces, tests, and documentation.

## Product and people

**Customer Storefront**

The customer-facing part of Bricomaitre through which people discover products, submit orders, and follow them.

**Commerce Operating System**

The internal part of Bricomaitre through which the operation manages catalog, orders, fulfilment, and its operational understanding.

**Customer**

A person who submits an Order, whether buying for household or professional use.

**Operator**

A person using the Commerce Operating System to perform commerce work. Use “administrator” only when the distinction is authorization rather than operational role.

## Orders and confirmation

**Order**

A Customer’s submitted request to buy. An Order does not prove that the Customer was reached, confirmed the request, received a Shipment, or paid.

**Operational Order Status**

The operation-owned, normalized view of an Order across contact, confirmation, Posting, and fulfilment outcomes. It may reflect a Shipment outcome while remaining separate from the carrier’s raw Shipment Status.

**Confirmation Outcome**

The contact result recorded by an Operator before Posting, such as confirmed, no answer, or cancelled.

**Confirmation**

The recorded outcome that an Operator reached the Customer and the Customer agreed that the Order should proceed.

**No-Answer Attempt**

One recorded unsuccessful attempt to reach a Customer. Several attempts may belong to one Order.

**Cancellation**

The recorded decision that an Order will not proceed. Order cancellation and carrier cancellation are separate events.

## Fulfilment and delivery

**Posting**

The system handoff that sends eligible confirmed Orders to a Carrier. Posting is not the physical Dispatch of a parcel.

**Shipment**

The carrier-facing fulfilment of an Order after Posting. Its state describes transport work, not confirmation or payment.

**Shipment Status**

The Carrier-owned raw state of a Shipment. An Order may have one current Operational Order Status and a different current Shipment Status; name the specific status when the distinction matters.

**Dispatch**

The physical handoff of a prepared parcel to the Carrier.

**Shipment Activity Time**

The time supplied for a carrier event, falling back to synchronization time only when the Carrier supplies no event time.

**Assistant-Influenced Order**

An Order preceded by a bounded Customer Storefront assistant interaction. It records an observable relationship, not causal lift.

## Storefront content

**Landing Page**

An Operator-authored, locale-specific campaign page composed from validated content blocks and live catalog facts.

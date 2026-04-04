export type EntityType =
  | 'products'
  | 'orders'
  | 'inventory'
  | 'assets'
  | 'brands'
  | 'categories'
  | 'brandsCategories'
  | 'bulletin';

export type ManagedEntity = {
  id: string;
  name: string;
  status: 'active' | 'draft' | 'archived';
  tags: string[];
  updatedAt: string;
  image?: string;
};

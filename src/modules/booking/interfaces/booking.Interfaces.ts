

interface PackageItem {
  equipmentId: string;
  quantity: number;
  pricePerDay?: number;
}

interface UserPackage {
  _id: string;
  name: string;
  description: string;
  items: PackageItem[];
  totalPricePerDay: number;
  createdBy: string;
}

interface ListedPackage {
  _id: string;
  name: string;
  description: string;
  items: { equipmentId: string; quantity: number }[];
  totalPrice: number;
  createdBy: string;
}
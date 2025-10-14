interface EquipmentAvailability {
  equipmentId: string;
  name: string;
  category: string;
  totalStock: number;
  bookedQty: number;
  unavailableQty: number;
  availableQty: number;
}

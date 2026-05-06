import { OrderStatus, StoreStatus, DriverStatus } from '@aks/shared';

type Status = OrderStatus | StoreStatus | DriverStatus;

const BADGE_CONFIG: Record<string, { label: string; classes: string }> = {
  // OrderStatus
  [OrderStatus.PENDING]: {
    label: 'Pending',
    classes: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  [OrderStatus.STORE_ACCEPTED]: {
    label: 'Accepted',
    classes: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  [OrderStatus.DRIVER_ASSIGNED]: {
    label: 'Driver Assigned',
    classes: 'bg-purple-50 text-purple-700 border-purple-200',
  },
  [OrderStatus.PICKED_UP]: {
    label: 'Picked Up',
    classes: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  [OrderStatus.DELIVERED]: {
    label: 'Delivered',
    classes: 'bg-green-50 text-green-700 border-green-200',
  },
  [OrderStatus.CANCELLED]: {
    label: 'Cancelled',
    classes: 'bg-gray-100 text-gray-600 border-gray-200',
  },
  [OrderStatus.REJECTED]: {
    label: 'Rejected',
    classes: 'bg-red-50 text-red-700 border-red-200',
  },

  // StoreStatus
  [StoreStatus.PENDING_APPROVAL]: {
    label: 'Pending Approval',
    classes: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  [StoreStatus.ACTIVE]: {
    label: 'Active',
    classes: 'bg-green-50 text-green-700 border-green-200',
  },
  [StoreStatus.SUSPENDED]: {
    label: 'Suspended',
    classes: 'bg-red-50 text-red-700 border-red-200',
  },

  // DriverStatus
  [DriverStatus.PENDING_APPROVAL]: {
    label: 'Pending Approval',
    classes: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  [DriverStatus.ACTIVE]: {
    label: 'Active',
    classes: 'bg-green-50 text-green-700 border-green-200',
  },
  [DriverStatus.SUSPENDED]: {
    label: 'Suspended',
    classes: 'bg-red-50 text-red-700 border-red-200',
  },
  [DriverStatus.ONLINE]: {
    label: 'Online',
    classes: 'bg-teal-50 text-teal-700 border-teal-200',
  },
  [DriverStatus.OFFLINE]: {
    label: 'Offline',
    classes: 'bg-gray-100 text-gray-500 border-gray-200',
  },
};

interface StatusBadgeProps {
  status: Status;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const config = BADGE_CONFIG[status] ?? {
    label: status,
    classes: 'bg-gray-100 text-gray-600 border-gray-200',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${config.classes}`}
    >
      {config.label}
    </span>
  );
}

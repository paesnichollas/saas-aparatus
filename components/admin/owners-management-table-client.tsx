"use client";

import dynamic from "next/dynamic";

const OwnersManagementTable = dynamic(
  () => import("@/components/admin/owners-management-table"),
  {
    ssr: false,
  },
);

interface OwnersManagementTableClientProps {
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: "CUSTOMER" | "OWNER" | "ADMIN";
    barbershopId: string | null;
    isActive: boolean;
    ownedBarbershop: {
      id: string;
      name: string;
      isActive: boolean;
    } | null;
  }>;
  barbershopOptions: Array<{
    id: string;
    name: string;
  }>;
}

const OwnersManagementTableClient = ({
  users,
  barbershopOptions,
}: OwnersManagementTableClientProps) => {
  return (
    <OwnersManagementTable
      users={users}
      barbershopOptions={barbershopOptions}
    />
  );
};

export default OwnersManagementTableClient;

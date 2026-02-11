import { prisma } from "../lib/prisma";

const MIN_NAME_LENGTH = 2;
const FALLBACK_CUSTOMER_NAME = "Cliente";

const normalizeName = (name: string) => {
  const collapsedName = name.trim().replace(/\s+/g, " ");

  if (collapsedName.length < MIN_NAME_LENGTH) {
    return FALLBACK_CUSTOMER_NAME;
  }

  return collapsedName;
};

const normalizePhone = (phone: string | null) => {
  return (phone ?? "").replace(/\D/g, "");
};

const run = async () => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  const groups = new Map<
    string,
    {
      normalizedName: string;
      normalizedPhone: string;
      users: Array<{
        id: string;
        name: string;
        email: string;
        phone: string | null;
      }>;
    }
  >();

  for (const user of users) {
    const normalizedPhone = normalizePhone(user.phone);

    if (!normalizedPhone) {
      continue;
    }

    const normalizedName = normalizeName(user.name);
    const key = `${normalizedName}::${normalizedPhone}`;
    const existingGroup = groups.get(key);

    if (existingGroup) {
      existingGroup.users.push(user);
      continue;
    }

    groups.set(key, {
      normalizedName,
      normalizedPhone,
      users: [user],
    });
  }

  const duplicatedGroups = Array.from(groups.values()).filter(
    (group) => group.users.length > 1,
  );

  if (duplicatedGroups.length === 0) {
    console.log(
      "Nenhum conflito encontrado para o par nome+telefone normalizados.",
    );
    return;
  }

  console.error(
    `Foram encontrados ${duplicatedGroups.length} conflito(s) de nome+telefone normalizados:`,
  );

  for (const [groupIndex, group] of duplicatedGroups.entries()) {
    console.error("");
    console.error(
      `Conflito ${groupIndex + 1}: name="${group.normalizedName}" phone="${group.normalizedPhone}"`,
    );

    for (const user of group.users) {
      const normalizedPhone = normalizePhone(user.phone);
      const normalizedName = normalizeName(user.name);

      console.error(
        `- id=${user.id} email=${user.email} originalName="${user.name}" originalPhone="${user.phone ?? "null"}" normalizedName="${normalizedName}" normalizedPhone="${normalizedPhone}"`,
      );
    }
  }

  process.exitCode = 1;
};

run()
  .catch((error: unknown) => {
    console.error(
      "[check-user-name-phone-duplicates] Falha ao verificar conflitos.",
      error,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

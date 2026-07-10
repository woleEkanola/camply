const { PrismaClient } = require("c:/Users/victo/OneDrive/Documents/Camply/camply/node_modules/@prisma/client");

const prisma = new PrismaClient();

const campusesData = [
  {
    name: "Iganmu Campus",
    campusCode: "IGM",
    displayOrder: 1,
    address: "The Covenant Place, Right Beside National Theatre",
    city: "Iganmu",
    state: "Lagos",
    country: "Nigeria",
  },
  {
    name: "Yaba Campus",
    campusCode: "YAB",
    displayOrder: 2,
    address: "400 Herbert Macaulay Road",
    city: "Yaba",
    state: "Lagos",
    zipCode: "100001",
    country: "Nigeria",
  },
  {
    name: "Lekki Campus",
    campusCode: "LKK",
    displayOrder: 3,
    address: "The Covenant Temple, Chisco Bus Stop, Behind Enyo Fuel Station",
    city: "Lekki",
    state: "Lagos",
    country: "Nigeria",
  },
  {
    name: "Ikeja Campus",
    campusCode: "IKJ",
    displayOrder: 4,
    address: "Lagos Marriott Hotel, GRA",
    city: "Ikeja",
    state: "Lagos",
    country: "Nigeria",
  },
  {
    name: "Maryland Campus",
    campusCode: "MYD",
    displayOrder: 5,
    address: "Genesis Cinema, Maryland Mall",
    city: "Maryland",
    state: "Lagos",
    country: "Nigeria",
  },
  {
    name: "Victoria Island Campus",
    campusCode: "VIC",
    displayOrder: 6,
    address: "Lagoon Restaurant, Ozumba Mbadiwe",
    city: "Victoria Island",
    state: "Lagos",
    country: "Nigeria",
  },
  {
    name: "Ajah Campus",
    campusCode: "AJH",
    displayOrder: 7,
    address: "Filmhouse Cinemas, Ikota Blackbell Mall",
    city: "Ajah",
    state: "Lagos",
    country: "Nigeria",
  },
  {
    name: "Sangotedo Campus",
    campusCode: "SGT",
    displayOrder: 8,
    address: "Genesis Cinema, Novare Mall",
    city: "Sangotedo",
    state: "Lagos",
    country: "Nigeria",
  },
  {
    name: "Ketu Ikosi Campus",
    campusCode: "KET",
    displayOrder: 9,
    address: "Centre for Management Development (CMD), Management Village, CMD Avenue, Shangisha",
    city: "Ketu",
    state: "Lagos",
    country: "Nigeria",
  },
  {
    name: "Anthony Campus",
    campusCode: "ANT",
    displayOrder: 10,
    address: "The Podium Event Centre, 10 Kudeti Avenue, Onigbongbo",
    city: "Anthony",
    state: "Lagos",
    country: "Nigeria",
  },
  {
    name: "Isolo Campus",
    campusCode: "ISL",
    displayOrder: 11,
    address: "23 Adebisi Omotola Street, By Asuani Police Station, Off Victoria Street",
    city: "Isolo",
    state: "Lagos",
    country: "Nigeria",
  },
  {
    name: "Festac Campus",
    campusCode: "FST",
    displayOrder: 12,
    address: "1st Avenue, Beside i-Fitness Gym",
    city: "Festac Town",
    state: "Lagos",
    country: "Nigeria",
  },
  {
    name: "Igando Campus",
    campusCode: "IGD",
    displayOrder: 13,
    address: "Lagos Theatre, 88 College Street, NYSC Bus Stop, LASU/Isheri Road",
    city: "Igando",
    state: "Lagos",
    country: "Nigeria",
  },
  {
    name: "Egbeda Campus",
    campusCode: "EGB",
    displayOrder: 14,
    address: "Grand Ovation Centre, Moshalashi Bus Stop, Beside Mobil Filling Station, Idimu Road",
    city: "Egbeda",
    state: "Lagos",
    country: "Nigeria",
  },
  {
    name: "Abule Egba Campus",
    campusCode: "AEG",
    displayOrder: 15,
    address: "3L Events Place, Chijioke House, Opposite Northwest Filling Station, General Bus Stop, Lagos-Abeokuta Expressway",
    city: "Abule Egba",
    state: "Lagos",
    country: "Nigeria",
  },
  {
    name: "Ikorodu Campus",
    campusCode: "IKD",
    displayOrder: 16,
    address: "Dream Parks and Gardens, Off Radio Road, Hilltop Estate, Obafemi Awolowo Road",
    city: "Ikorodu",
    state: "Lagos",
    country: "Nigeria",
  },
  {
    name: "Badagry Campus",
    campusCode: "BDG",
    displayOrder: 17,
    address: "Sycomore Hotels Event Hall, No. 1 Seje Road, Ajara-Topa",
    city: "Badagry",
    state: "Lagos",
    country: "Nigeria",
  }
];

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-") // Replace spaces with -
    .replace(/[^\w\-]+/g, "") // Remove all non-word chars
    .replace(/\-\-+/g, "-"); // Replace multiple - with single -
}

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: "innovativekemka@gmail.com" },
  });

  if (!user || !user.organizationId) {
    console.error("User innovativekemka@gmail.com with an organization was not found.");
    return;
  }

  const organizationId = user.organizationId;
  console.log(`Seeding campuses for Organization: ${organizationId}`);

  // Delete existing custom campuses under this organization to avoid duplicate name violations
  const customCampusNames = campusesData.map(c => c.name);
  await prisma.campus.deleteMany({
    where: {
      organizationId,
      name: { in: customCampusNames }
    }
  });

  for (const campus of campusesData) {
    const slug = slugify(campus.name);
    const created = await prisma.campus.create({
      data: {
        name: campus.name,
        slug,
        address: campus.address,
        city: campus.city,
        state: campus.state,
        zipCode: campus.zipCode || null,
        country: campus.country,
        campusCode: campus.campusCode,
        displayOrder: campus.displayOrder,
        organizationId,
        active: true,
        signupOpen: true,
      }
    });
    console.log(`Created Campus: ${created.name} (${created.campusCode})`);
  }

  console.log("All 17 campuses seeded successfully!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

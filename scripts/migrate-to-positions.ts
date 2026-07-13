import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting organizational structure position migration...");

  // Retrieve all organizations
  const organizations = await prisma.organization.findMany();
  console.log(`Found ${organizations.length} organization(s).`);

  for (const org of organizations) {
    console.log(`\n--- Migrating Organization: "${org.name}" (${org.id}) ---`);

    // Fetch camps under this organization
    const camps = await prisma.camp.findMany({
      where: { organizationId: org.id },
    });
    console.log(`Found ${camps.length} camp(s).`);

    // Fetch users in this organization with administrative roles
    const orgAdmins = await prisma.user.findMany({
      where: {
        organizationId: org.id,
        role: { in: ["OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE"] },
        active: true,
        deletedAt: null,
      },
    });
    console.log(`Found ${orgAdmins.length} active administrative user(s) in organization.`);

    for (const camp of camps) {
      console.log(`\nProcessing Camp: "${camp.name}" (${camp.id})`);

      // 1. Create Root positions
      // A. Camp Director (top of chart)
      let directorPosition = await prisma.position.findFirst({
        where: { campId: camp.id, name: "Camp Director", deletedAt: null },
      });
      if (!directorPosition) {
        directorPosition = await prisma.position.create({
          data: {
            name: "Camp Director",
            campId: camp.id,
            displayOrder: 1,
          },
        });
        console.log(`Created root position: "Camp Director" (${directorPosition.id})`);
      }

      // B. Camp Administrator (reports to Camp Director)
      let adminPosition = await prisma.position.findFirst({
        where: { campId: camp.id, name: "Camp Administrator", deletedAt: null },
      });
      if (!adminPosition) {
        adminPosition = await prisma.position.create({
          data: {
            name: "Camp Administrator",
            campId: camp.id,
            parentPositionId: directorPosition.id,
            displayOrder: 2,
          },
        });
        console.log(`Created position: "Camp Administrator" (${adminPosition.id}) under "Camp Director"`);
      }

      // C. Campus Representative (reports to Camp Director)
      let campusRepPosition = await prisma.position.findFirst({
        where: { campId: camp.id, name: "Campus Representative", deletedAt: null },
      });
      if (!campusRepPosition) {
        campusRepPosition = await prisma.position.create({
          data: {
            name: "Campus Representative",
            campId: camp.id,
            parentPositionId: directorPosition.id,
            displayOrder: 3,
          },
        });
        console.log(`Created position: "Campus Representative" (${campusRepPosition.id}) under "Camp Director"`);
      }

      // 2. Assign administrative users to root positions
      for (const adminUser of orgAdmins) {
        let targetPositionId = "";
        if (adminUser.role === "OWNER") {
          targetPositionId = directorPosition.id;
        } else if (adminUser.role === "ADMIN") {
          targetPositionId = adminPosition.id;
        } else if (adminUser.role === "CAMPUS_REPRESENTATIVE") {
          targetPositionId = campusRepPosition.id;
        }

        if (targetPositionId) {
          // Check if this assignment exists
          // Since root admins don't have StaffProfile records (they are User records), 
          // we need to find if there is an associated StaffProfile.
          // Wait, PositionAssignment expects a `staffId` pointing to `StaffProfile`.
          // Let's check if the admin user has a StaffProfile for this camp.
          let staffProfile = await prisma.staffProfile.findFirst({
            where: { userId: adminUser.id, campId: camp.id, deletedAt: null },
          });

          // If no StaffProfile exists, create a skeleton StaffProfile for them so they can occupy the position.
          if (!staffProfile) {
            staffProfile = await prisma.staffProfile.create({
              data: {
                userId: adminUser.id,
                organizationId: org.id,
                campId: camp.id,
                type: adminUser.role === "OWNER" || adminUser.role === "ADMIN" ? "VOLUNTEER" : "VOLUNTEER", // fallback type
                status: "APPROVED",
                firstName: adminUser.firstName ?? "Admin",
                lastName: adminUser.lastName ?? "User",
                phone: adminUser.phone ?? "N/A",
                email: adminUser.email,
                approvedAt: new Date(),
              },
            });
            console.log(`Created StaffProfile skeleton for admin user ${adminUser.email}`);
          }

          const existingAssignment = await prisma.positionAssignment.findFirst({
            where: {
              positionId: targetPositionId,
              staffId: staffProfile.id,
              isCurrent: true,
            },
          });

          if (!existingAssignment) {
            await prisma.positionAssignment.create({
              data: {
                positionId: targetPositionId,
                staffId: staffProfile.id,
                isCurrent: true,
              },
            });
            console.log(`Assigned User ${adminUser.email} to position "${adminUser.role}"`);
          }
        }
      }

      // 3. Process departments
      const departments = await prisma.department.findMany({
        where: { organizationId: org.id, campId: camp.id, deletedAt: null },
      });
      console.log(`Found ${departments.length} department(s) in camp.`);

      for (const dept of departments) {
        console.log(`  Processing Department: "${dept.name}" (${dept.id})`);

        // A. Create Department Head position
        let headPosition = await prisma.position.findFirst({
          where: { campId: camp.id, departmentId: dept.id, name: `${dept.name} Head`, deletedAt: null },
        });
        if (!headPosition) {
          headPosition = await prisma.position.create({
            data: {
              name: `${dept.name} Head`,
              campId: camp.id,
              departmentId: dept.id,
              parentPositionId: directorPosition.id, // default to report to Director
              displayOrder: 1,
            },
          });
          console.log(`    Created position: "${dept.name} Head" (${headPosition.id})`);
        }

        // B. Create Department Assistant Head position
        let assistantHeadPosition = await prisma.position.findFirst({
          where: { campId: camp.id, departmentId: dept.id, name: `${dept.name} Assistant Head`, deletedAt: null },
        });
        if (!assistantHeadPosition) {
          assistantHeadPosition = await prisma.position.create({
            data: {
              name: `${dept.name} Assistant Head`,
              campId: camp.id,
              departmentId: dept.id,
              parentPositionId: headPosition.id, // reports to Head
              displayOrder: 2,
            },
          });
          console.log(`    Created position: "${dept.name} Assistant Head" (${assistantHeadPosition.id})`);
        }

        // C. Create Teacher position for this department
        let teacherPosition = await prisma.position.findFirst({
          where: { campId: camp.id, departmentId: dept.id, name: `${dept.name} Teacher`, deletedAt: null },
        });
        if (!teacherPosition) {
          teacherPosition = await prisma.position.create({
            data: {
              name: `${dept.name} Teacher`,
              campId: camp.id,
              departmentId: dept.id,
              parentPositionId: headPosition.id, // reports to Head
              displayOrder: 3,
            },
          });
          console.log(`    Created position: "${dept.name} Teacher" (${teacherPosition.id})`);
        }

        // D. Create Volunteer position for this department
        let volunteerPosition = await prisma.position.findFirst({
          where: { campId: camp.id, departmentId: dept.id, name: `${dept.name} Volunteer`, deletedAt: null },
        });
        if (!volunteerPosition) {
          volunteerPosition = await prisma.position.create({
            data: {
              name: `${dept.name} Volunteer`,
              campId: camp.id,
              departmentId: dept.id,
              parentPositionId: headPosition.id, // reports to Head
              displayOrder: 4,
            },
          });
          console.log(`    Created position: "${dept.name} Volunteer" (${volunteerPosition.id})`);
        }

        // 4. Assign staff members of this department to positions
        const staffProfiles = await prisma.staffProfile.findMany({
          where: { departmentId: dept.id, campId: camp.id, deletedAt: null },
        });
        console.log(`    Found ${staffProfiles.length} staff member(s) assigned directly to department.`);

        for (const staff of staffProfiles) {
          let targetPositionId = "";

          if (staff.isDepartmentHead) {
            targetPositionId = headPosition.id;
          } else if (staff.isAssistantHead) {
            targetPositionId = assistantHeadPosition.id;
          } else if (staff.type === "TEACHER") {
            targetPositionId = teacherPosition.id;
          } else {
            targetPositionId = volunteerPosition.id;
          }

          // Create PositionAssignment
          const existingAssignment = await prisma.positionAssignment.findFirst({
            where: {
              positionId: targetPositionId,
              staffId: staff.id,
              isCurrent: true,
            },
          });

          if (!existingAssignment) {
            await prisma.positionAssignment.create({
              data: {
                positionId: targetPositionId,
                staffId: staff.id,
                isCurrent: true,
              },
            });
            console.log(`      Assigned ${staff.firstName} ${staff.lastName} to position "${dept.name} ${staff.isDepartmentHead ? 'Head' : staff.isAssistantHead ? 'Assistant Head' : staff.type}"`);
          }
        }
      }
    }
  }

  console.log("\nOrganizational structure position migration completed successfully!");
}

main()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

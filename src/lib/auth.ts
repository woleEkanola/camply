import { compare, hash } from 'bcryptjs';
import { prisma } from '../server/db';

// UserRole is not exported from @prisma/client after downgrade. Define locally to match schema.
export type UserRole = "SUPER_ADMIN" | "OWNER" | "ADMIN" | "LOCATION_ADMIN";

export async function hashPassword(password: string): Promise<string> {
  return await hash(password, 12);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return await compare(password, hashedPassword);
}

export async function createUser(firstName: string, email: string, password: string, role: UserRole = "ADMIN") {
  const hashedPassword = await hashPassword(password);
  
  return prisma.user.create({
    data: {
      firstName,
      email,
      password: hashedPassword,
      role,
    },
  });
}

export async function getUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
  });
}

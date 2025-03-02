import NextAuth, { getServerSession } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import { MongoDBAdapter } from "@auth/mongodb-adapter";

import type { Adapter } from "next-auth/adapters";
import clientPromise from "./db";

const admin = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export const authOptions = {
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_ID ?? "",
      clientSecret: process.env.GITHUB_SECRET ?? "",
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_ID ?? "",
      clientSecret: process.env.GOOGLE_SECRET ?? "",
    }),
  ],
  adapter: MongoDBAdapter(clientPromise) as Adapter,

  callbacks: {
    session: ({ session, token, user }: any) => {
      if (admin.includes(session?.user?.email?.trim().toLowerCase() ?? "")) {
        return session;
      } else {
        return false;
      }
    },
  },
};

export const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };

export async function isAdmin() {
  const session = await getServerSession(authOptions);
  if (session) {
    throw "not admin";
  }
}

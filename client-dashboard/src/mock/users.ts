import type { User } from "../types";

export const users: User[] = [
  // Smith's Roofing
  { id: "u-sr-1", clientId: "smiths-roofing", name: "Daniel Smith", email: "dan@smithsroofing.com", role: "owner" },
  { id: "u-sr-2", clientId: "smiths-roofing", name: "Karen Ortiz", email: "karen@smithsroofing.com", role: "manager" },
  { id: "u-sr-3", clientId: "smiths-roofing", name: "Mike Davis", email: "mike@smithsroofing.com", role: "rep" },
  { id: "u-sr-4", clientId: "smiths-roofing", name: "Tony Russo", email: "tony@smithsroofing.com", role: "rep" },
  { id: "u-sr-5", clientId: "smiths-roofing", name: "Ben Carter", email: "ben@smithsroofing.com", role: "rep" },

  // Glow Med Spa
  { id: "u-gm-1", clientId: "glow-medspa", name: "Lauren Park", email: "lauren@glowmedspa.com", role: "owner" },
  { id: "u-gm-2", clientId: "glow-medspa", name: "Priya Shah", email: "priya@glowmedspa.com", role: "manager" },
  { id: "u-gm-3", clientId: "glow-medspa", name: "Megan Hill", email: "megan@glowmedspa.com", role: "rep" },
  { id: "u-gm-4", clientId: "glow-medspa", name: "Ava Brooks", email: "ava@glowmedspa.com", role: "rep" },

  // Apex Detailing
  { id: "u-ad-1", clientId: "apex-detailing", name: "Marcus King", email: "marcus@apexdetailing.com", role: "owner" },
  { id: "u-ad-2", clientId: "apex-detailing", name: "Jordan Lee", email: "jordan@apexdetailing.com", role: "manager" },
  { id: "u-ad-3", clientId: "apex-detailing", name: "Eli Vance", email: "eli@apexdetailing.com", role: "rep" },
  { id: "u-ad-4", clientId: "apex-detailing", name: "Sasha Reyes", email: "sasha@apexdetailing.com", role: "rep" },
];

export function getUser(userId: string): User | undefined {
  return users.find((u) => u.id === userId);
}

export function getUsersForClient(clientId: string): User[] {
  return users.filter((u) => u.clientId === clientId);
}

export function getOwnerForClient(clientId: string): User {
  const owner = users.find((u) => u.clientId === clientId && u.role === "owner");
  if (!owner) throw new Error(`No owner found for client ${clientId}`);
  return owner;
}

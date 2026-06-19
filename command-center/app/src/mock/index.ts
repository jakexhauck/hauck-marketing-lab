import { clients, getClient } from "./clients";
import { users, getUser, getUsersForClient, getOwnerForClient } from "./users";
import { getLeadsForClient } from "./leads";
import { computeStats } from "./stats";
import type { Client, Lead, Stats, User } from "../types";

export { clients, getClient, users, getUser, getUsersForClient, getOwnerForClient, getLeadsForClient, computeStats };

export interface MockDataBundle {
  client: Client;
  users: User[];
  owner: User;
  leads: Lead[];
  stats: Stats;
}

export function getMockData(clientId: string): MockDataBundle {
  const client = getClient(clientId);
  if (!client) throw new Error(`Unknown client ${clientId}`);
  const clientUsers = getUsersForClient(clientId);
  const owner = getOwnerForClient(clientId);
  const leads = getLeadsForClient(clientId);
  const stats = computeStats(leads, client.monthlySpend);
  return { client, users: clientUsers, owner, leads, stats };
}

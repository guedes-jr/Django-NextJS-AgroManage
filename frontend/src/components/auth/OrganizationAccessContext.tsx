"use client";

import { createContext, useContext } from "react";
import type { OrganizationAccess } from "@/services/organizationAccess";

export const OrganizationAccessContext = createContext<OrganizationAccess | null>(null);
export const useOrganizationAccess = () => useContext(OrganizationAccessContext);

import React, { useEffect, useState } from "react";
import { useAuth } from "../components/AuthContext";
import SupportInboxPlugin from "../components/SupportInboxPlugin";
import LoginPage from "./login";

export default function Home() {
  const { isAuthenticated } = useAuth();

  return isAuthenticated
    ? <SupportInboxPlugin />
    : <LoginPage />;
}

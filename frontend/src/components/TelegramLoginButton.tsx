import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api } from "../api/client";

export type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

declare global {
  interface Window {
    goalkingTelegramAuth?: (user: TelegramUser) => void;
  }
}

/** Official Telegram Login Widget. Requires the site domain to be set for the bot in @BotFather (/setdomain). */
export function TelegramLoginButton({ onAuth }: { onAuth: (user: TelegramUser) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const config = useQuery({
    queryKey: ["config"],
    queryFn: () => api<{ telegram_bot_username: string }>("/api/config/", { auth: false }),
    staleTime: Infinity,
  });
  const bot = config.data?.telegram_bot_username;

  useEffect(() => {
    window.goalkingTelegramAuth = onAuth;
    return () => {
      delete window.goalkingTelegramAuth;
    };
  }, [onAuth]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !bot) return;
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", bot);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "10");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-onauth", "goalkingTelegramAuth(user)");
    el.replaceChildren(script);
    return () => el.replaceChildren();
  }, [bot]);

  if (!bot) return null;
  return <div ref={ref} style={{ display: "flex", justifyContent: "center", minHeight: 40 }} />;
}

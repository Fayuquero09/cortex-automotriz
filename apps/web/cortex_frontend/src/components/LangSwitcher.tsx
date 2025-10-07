"use client";
import React from 'react';
import { useI18n } from '@/lib/i18n';

export default function LangSwitcher(){
  const { lang, setLang } = useI18n();
  return (
    <select
      value={lang}
      onChange={(e)=> setLang(e.target.value as any)}
      className="lang-switcher"
      suppressHydrationWarning
    >
      <option value="es">ES</option>
      <option value="en">EN</option>
      <option value="zh">中文</option>
    </select>
  );
}

-- 0175: conversion assets are gone (Jake, 2026-10-20; docs/build-plans/four-agents-and-handoffs.md).
--
-- followup_pages held them (0093, with columns from 0095, 0096, 0098, 0133 and
-- 0167). Nothing reads or writes it since the app stopped filing landing pages
-- into it. Applied only after that app is live. The followup-assets storage
-- bucket stays: the Lead Form editor and client pictures still use it.

drop table if exists public.followup_pages;

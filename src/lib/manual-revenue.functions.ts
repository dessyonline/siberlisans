import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "./auth-middleware.server";
import { mysqlOne, mysqlQuery, num } from "./mysql.server";

export type ManualRevenueRow={id:string;occurred_at:string;amount_try:number;cost_try:number;label:string;note:string|null;created_at:string};
const listInput=z.object({from:z.string().datetime().optional(),to:z.string().datetime().optional()}).default({});
export const listManualRevenue=createServerFn({method:"POST"}).middleware([requireAdmin]).validator((d:unknown)=>listInput.parse(d??{})).handler(async({data})=>{
  const rows=await mysqlQuery<Record<string,unknown>>(`SELECT id,occurred_at,amount_try,cost_try,label,note,created_at FROM manual_revenue_entries WHERE occurred_at>=? AND occurred_at<? ORDER BY occurred_at DESC`,[data.from??new Date(Date.now()-90*864e5).toISOString(),data.to??new Date(Date.now()+864e5).toISOString()]);
  return rows.map(r=>({id:String(r.id),occurred_at:String(r.occurred_at),amount_try:num(r.amount_try)??0,cost_try:num(r.cost_try)??0,label:String(r.label),note:(r.note as string|null)??null,created_at:String(r.created_at)}));
});
const addInput=z.object({amount:z.number().finite(),label:z.string().min(1).max(160),occurred_at:z.string().datetime().optional(),cost:z.number().finite().min(0).default(0),note:z.string().max(500).optional()});
export const addManualRevenue=createServerFn({method:"POST"}).middleware([requireAdmin]).validator((d:unknown)=>addInput.parse(d)).handler(async({data,context})=>{const id=crypto.randomUUID();await mysqlQuery(`INSERT INTO manual_revenue_entries(id,occurred_at,amount_try,cost_try,label,note,created_by,created_at,updated_at)VALUES(?,?,?,?,?,?,?,NOW(),NOW())`,[id,data.occurred_at??new Date().toISOString(),data.amount,data.cost,data.label.trim(),data.note??null,context.userId]);return{id};});
export const deleteManualRevenue=createServerFn({method:"POST"}).middleware([requireAdmin]).validator((d:unknown)=>z.object({id:z.string().uuid()}).parse(d)).handler(async({data})=>{await mysqlQuery("DELETE FROM manual_revenue_entries WHERE id=?",[data.id]);return{ok:true};});
export const repairDeliveries=createServerFn({method:"POST"}).middleware([requireAdmin]).handler(async()=>{
  const orders=await mysqlQuery<{id:string;reference_code:string;product_id:string}>(`SELECT o.id,o.reference_code,o.product_id FROM orders o JOIN products p ON p.id=o.product_id WHERE o.status='approved' AND COALESCE(p.manual_fulfillment,0)=0 AND COALESCE(p.source,'')<>'uniquelisans' AND NOT EXISTS(SELECT 1 FROM order_keys ok WHERE ok.order_id=o.id) ORDER BY o.approved_at DESC LIMIT 200`);
  const outcomes=[];
  for(const o of orders){const key=await mysqlOne<{id:string}>("SELECT id FROM license_keys WHERE product_id=? AND status='available' ORDER BY created_at LIMIT 1",[o.product_id]);if(!key){outcomes.push({order_id:o.id,reference_code:o.reference_code,outcome:"atlandi"});continue}await mysqlQuery("UPDATE license_keys SET status='assigned',assigned_order_id=?,assigned_at=NOW() WHERE id=? AND status='available'",[o.id,key.id]);const assigned=await mysqlOne<{assigned_order_id:string|null}>("SELECT assigned_order_id FROM license_keys WHERE id=?",[key.id]);if(assigned?.assigned_order_id!==o.id){outcomes.push({order_id:o.id,reference_code:o.reference_code,outcome:"atlandi"});continue}await mysqlQuery("INSERT INTO order_keys(id,order_id,license_key_id,delivered_at) VALUES(?,?,?,NOW())",[crypto.randomUUID(),o.id,key.id]);outcomes.push({order_id:o.id,reference_code:o.reference_code,outcome:"teslim edildi"});}
  return outcomes;
});

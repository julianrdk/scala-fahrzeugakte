import { mkdirSync,writeFileSync } from 'node:fs';
const nullable = s=>({anyOf:[s,{type:'null'}]});
const str=nullable({type:'string',maxLength:10000});
const num=nullable({type:'number',minimum:0,maximum:10000000});
const integer=nullable({type:'integer',minimum:0,maximum:10000000});
const money=nullable({type:'integer',minimum:-10000000000,maximum:10000000000});
const date=nullable({type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$'});
const bool=nullable({type:'boolean'});
const ref={type:'string',pattern:'^[A-Za-z0-9_-]{1,100}$'};
const refs={type:'array',items:ref,uniqueItems:true,maxItems:100};
const en=(...e)=>({enum:e});
const obj=(properties,optional=[])=>({type:'object',properties,required:Object.keys(properties).filter(k=>!optional.includes(k)),additionalProperties:false});
const arr=items=>({type:'array',items,maxItems:100});
const parts=obj({description:str,part_number:str,quantity:num,unit:str,specification:str},['specification']);
const definitions={
 document:obj({ref,source_filename:str,title:{type:'string',minLength:1,maxLength:500},document_type:en('invoice','receipt','contract','approval','inspection','service_history','photo','other'),page_numbers:{type:'array',items:{type:'integer',minimum:1},uniqueItems:true}},['page_numbers']),
 expense:obj({ref,title:{type:'string',minLength:1,maxLength:500},category:en(null,'Tanken','Wartung & Reparatur','Umbauten & Zubehör','Versicherung & Steuer','Parken & Gebühren','Pflege','Fahrzeugkauf & Verkauf','Sonstiges'),date,odometer_km:num,amount_cents:money,currency:nullable({type:'string',pattern:'^[A-Z]{3}$'}),vendor:str,invoice_number:str,document_refs:refs,notes:str,cashflow_type:en('expense','income'),fuel:obj({liters:nullable({type:'number',exclusiveMinimum:0,maximum:1000}),fuel_type:str,full_tank:bool,missed_previous_fillup:bool,station_name:str}),items:arr(parts)},['cashflow_type','fuel','items']),
 work:obj({ref,title:{type:'string',minLength:1,maxLength:500},kind:en('maintenance','repair','modification','inspection','other'),status:en('completed','planned'),date,odometer_km:num,performed_by:en('self','workshop','unknown'),description:str,expense_refs:refs,document_refs:refs,parts:arr(parts),estimated_cost_cents:nullable({type:'integer',minimum:0,maximum:10000000000}),modification_details:obj({manufacturer:str,part_number:str,approval_number:str,status:en('planned','installed','removed'),installation_date:date,installation_odometer_km:num,removal_date:date,removal_odometer_km:num},['installation_date','installation_odometer_km','removal_date','removal_odometer_km'])},['parts','estimated_cost_cents','modification_details']),
 reminder:obj({ref,title:{type:'string',minLength:1,maxLength:500},work_type:en('maintenance','repair','modification','inspection','other'),due_date:date,due_odometer_km:num,repeat_months:integer,repeat_km:integer,lead_days:integer,lead_km:integer,email_enabled:bool,basis_work_ref:nullable(ref),notes:str})
};
const schema={$schema:'http://json-schema.org/draft-07/schema#',$id:'https://scala-fahrzeugakte.invalid/schemas/import-v1.json',title:'Fahrzeugakte JSON-Vertrag v1',...obj({format:{const:'vehicle-record-import'},schema_version:{const:1},import_id:str,vehicle_label:str,documents:arr({$ref:'#/definitions/document'}),expenses:arr({$ref:'#/definitions/expense'}),work:arr({$ref:'#/definitions/work'}),reminders:arr({$ref:'#/definitions/reminder'}),warnings:{type:'array',items:{type:'string',maxLength:10000},maxItems:100}}),definitions};
mkdirSync('shared',{recursive:true});writeFileSync('shared/import-v1.schema.json',JSON.stringify(schema,null,2)+'\n');

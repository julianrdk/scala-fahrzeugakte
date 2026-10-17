import {it,expect} from 'vitest';
import {readdirSync,readFileSync} from 'node:fs';
import {parseImport} from '../shared/logic';
for(const name of readdirSync('examples/valid'))it('gültiges Vertragsbeispiel: '+name,()=>expect(()=>parseImport(readFileSync('examples/valid/'+name,'utf8'))).not.toThrow());
for(const name of readdirSync('examples/invalid'))it('fehlerhaftes Vertragsbeispiel: '+name,()=>expect(()=>parseImport(readFileSync('examples/invalid/'+name,'utf8'))).toThrow());

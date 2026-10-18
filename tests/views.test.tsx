import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {LoginView} from '../src/LoginView';
import {VehicleSetup} from '../src/VehicleSetup';
describe('Neutrale Anmelde- und Fahrzeugansichten',()=>{
 it('zeigt vor Anmeldung weder Marke noch Modell, Fahrzeugnavigation oder Werbesprüche',()=>{const html=renderToStaticMarkup(<LoginView checking={false} busy={false} ready persistent remember onRemember={()=>{}} onConnect={()=>{}} onTest={()=>{}} error="" notice=""/>);expect(html).toContain('Fahrzeugakte');expect(html).toContain('Mit Google anmelden');expect(html).not.toMatch(/Scala|Škoda|Dein Überblick|Deine Unterlagen|Eine Rechnung|Historie|Fahrzeug hinzufügen/);});
 it('fragt Hersteller und Modell ohne vorausgefülltes Fahrzeug ab',()=>{const html=renderToStaticMarkup(<VehicleSetup busy={false} error="" onSave={()=>{}} onLogout={()=>{}}/>);expect(html).toContain('Fahrzeug hinzufügen');expect(html).toContain('name="manufacturer"');expect(html).toContain('name="model"');expect(html).not.toMatch(/Scala|Škoda|value="Volkswagen"/);});
});

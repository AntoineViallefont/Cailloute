import {Component,type ReactNode} from 'react';
import {finishLaunch} from './launch';
export class AppRecovery extends Component<{children:ReactNode},{failed:boolean}> {
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 componentDidCatch(error:Error){console.error('Ouverture Cailloute interrompue',error);finishLaunch();}
 render(){return this.state.failed?<main className="app-recovery" role="alert">
  <h1>Cailloute n’a pas pu s’ouvrir</h1>
  <p>Vos lieux, photos et avis enregistrés sont conservés.</p>
  <button onClick={()=>location.reload()}>Réessayer</button>
 </main>:this.props.children;}
}

import {it,expect} from 'vitest';
import {sharedValidation} from './shared-validation';
import type {Place} from './types';
it('publie la validation automatique des ajouts et corrections',()=>{for(const kind of ['place.create','place.edit'])expect(sharedValidation({information_validated:false} as Place,kind,{},'2026-10-06')).toMatchObject({information_validated:true,validated_at:'2026-10-06',validation_changed_at:'2026-10-06'});});
it('respecte une invalidation explicite et ne valide pas via une photo',()=>{expect(sharedValidation({information_validated:true} as Place,'place.validate',{value:false}).information_validated).toBe(false);expect(sharedValidation({information_validated:false} as Place,'photo.add',{}).information_validated).toBe(false);});

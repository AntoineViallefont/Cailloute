import { afterEach, describe, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({prepare:vi.fn(), cancelPrepare:vi.fn().mockResolvedValue(undefined)}));
vi.mock('@capacitor/core', () => ({registerPlugin:()=>native}));
import {prepareNativeAvatar} from './native-avatar';
afterEach(()=>{vi.useRealTimers();native.prepare.mockReset();native.cancelPrepare.mockClear()});
describe('portrait Android sans détecteur',()=>{
  it('réduit sans position ni visage, avec identifiant annulable',async()=>{
    native.prepare.mockResolvedValue({base64:'YWJj'});const blob=await prepareNativeAvatar('content://portrait');
    expect(native.prepare).toHaveBeenCalledWith({uri:'content://portrait',includePosition:false,detectFaces:false,id:expect.any(String)});
    expect(blob.type).toBe('image/jpeg');expect(blob.size).toBe(3);expect(native.cancelPrepare).not.toHaveBeenCalled();
  });
  it('annule le travail natif lorsque la préparation est interrompue',async()=>{
    native.prepare.mockReturnValue(new Promise(()=>{}));const controller=new AbortController();const promise=prepareNativeAvatar('content://portrait',controller.signal);
    const rejected=expect(promise).rejects.toMatchObject({name:'AbortError'});controller.abort();await rejected;
    expect(native.cancelPrepare).toHaveBeenCalledWith({id:native.prepare.mock.calls[0][0].id});
  });
  it('libère également le travail natif après dépassement du délai',async()=>{
    vi.useFakeTimers();native.prepare.mockReturnValue(new Promise(()=>{}));const promise=prepareNativeAvatar('content://portrait');
    const rejected=expect(promise).rejects.toThrow('Lecture trop longue');await vi.advanceTimersByTimeAsync(15001);await rejected;
    expect(native.cancelPrepare).toHaveBeenCalledWith({id:native.prepare.mock.calls[0][0].id});
  });
});

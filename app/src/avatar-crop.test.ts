import { describe, expect, it } from 'vitest';
import { avatarCropRect, moveAvatarCrop, CENTERED_AVATAR, AVATAR_SIZE, AVATAR_MAX_BYTES } from './avatar-crop';
describe('recadrage du portrait privé', () => {
  it('centre un carré dans une image paysage ou portrait sans déformation', () => {
    expect(avatarCropRect(1200, 800, CENTERED_AVATAR)).toMatchObject({x:200,y:0,edge:800});
    expect(avatarCropRect(800, 1200, CENTERED_AVATAR)).toMatchObject({x:0,y:200,edge:800});
  });
  it('zoome et déplace sans laisser apparaître de bord vide', () => {
    const crop = moveAvatarCrop(1200, 800, {...CENTERED_AVATAR,zoom:2}, 10000,-10000,320);
    expect(avatarCropRect(1200,800,crop)).toMatchObject({x:0,y:400,edge:400});
    const reverse = moveAvatarCrop(1200,800,crop,-10000,10000,320);
    expect(avatarCropRect(1200,800,reverse)).toMatchObject({x:800,y:0,edge:400});
  });
  it('borne le zoom et garde le format compact demandé', () => {
    expect(avatarCropRect(800,800,{...CENTERED_AVATAR,zoom:0}).edge).toBe(800);
    expect(avatarCropRect(800,800,{...CENTERED_AVATAR,zoom:99}).edge).toBe(200);
    expect(AVATAR_SIZE).toBe(320); expect(AVATAR_MAX_BYTES).toBe(40000);
  });
});

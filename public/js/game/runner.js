// «Бегом на пару»: аватар бежит по коридору учебного корпуса к аудитории.
// Три дорожки, прыжок и подкат, М-коины и бонусы. Время забега отмеряет сервер — 5 минут в день.
import { svg as avatarSvg, pet as petSvg } from '../art/avatar.js';

const NAVY = '#0F2D69', GOLD = '#C9A646', INK = '#0B2150';
const F = 7;                 // фокусное расстояние камеры
const Z_FAR = 70;            // дальность прорисовки
const DOORS = ['1001', '1023', '2007', '2014', '3008', '3047', '4018', '4031'];
const PZ = 2.4;              // глубина, на которой бежит игрок

function toImg(svg) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}


// Заявки и справки: каталог, форма с автозаполнением, статус «как у посылки» и электронная справка.
import { get, post } from '../lib/api.js';
import { session, setPlay, on } from '../lib/bus.js';
import { esc, plural, stamp, when, dayShort, dateLong } from '../lib/format.js';
import { icon } from '../ui/icons.js';
import { modal, toast, confirm } from '../ui/overlay.js';
import * as fx from '../ui/fx.js';
import { logoMark } from '../art/logo.js';
import { skeleton, errorBox, statusPill, pipe, STATUS_ICON } from './common.js';


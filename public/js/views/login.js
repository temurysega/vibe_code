// Вход по логину и паролю. В демо-режиме под формой — тестовые учётные записи для жюри.
// Настоящие логины и пароли МГИМО здесь не принимаются: сервер знает только демо-аккаунты.
import { get, post, setCsrf } from '../lib/api.js';
import { session } from '../lib/bus.js';
import { esc } from '../lib/format.js';
import { icon } from '../ui/icons.js';
import { logoMark, wordmark } from '../art/logo.js';
import { svg as avatarSvg, pet, backdrop } from '../art/avatar.js';


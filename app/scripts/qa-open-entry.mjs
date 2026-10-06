import * as cloud from '../src/free-cloud';
import * as store from '../src/store';
import * as sync from '../src/free-sync';
import * as importer from '../src/OpenPhotoImport';
import * as photoImport from '../src/open-photo-import';
import {Detail} from '../src/Detail';
import React from 'react';
import {createRoot} from 'react-dom/client';
window.qa={cloud,store,sync,importer,photoImport,React,createRoot,Detail};

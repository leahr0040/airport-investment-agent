import axios from 'axios';
import { stubAdapter } from '@test/helpers/axios';

// createHttpClient() calls axios.create(), which merges axios.defaults - so every instance the
// adapters build, including the module singletons, sends through the stub instead of the network.
axios.defaults.adapter = stubAdapter;

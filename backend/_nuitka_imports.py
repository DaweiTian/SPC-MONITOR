# Force-import modules that Nuitka can't trace from scipy/numpy dynamic imports
# Only include what the backend actually uses

import numpy
import numpy.linalg
import numpy.fft

import scipy.stats
import scipy._lib._array_api
import scipy._external
import scipy._external.array_api_compat
import scipy._external.array_api_compat.numpy
import scipy._external.array_api_compat.numpy.fft
import scipy._external.array_api_compat.numpy.linalg

import statsmodels.tsa.holtwinters
import statsmodels.tsa.arima.model

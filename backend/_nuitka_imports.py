# Force-import modules that Nuitka can't trace from scipy/numpy dynamic imports
# This file is only used during Nuitka compilation to ensure all submodules are included

import scipy.stats
import scipy.sparse
import scipy.optimize
import scipy.interpolate
import scipy.special
import scipy.linalg
import scipy.fft
import scipy.ndimage
import scipy.signal
import scipy.spatial
import scipy.cluster
import scipy.io
import scipy.integrate
import scipy.odr
import scipy._lib
import scipy._lib._array_api
import scipy._external
import scipy._external.array_api_compat
import scipy._external.array_api_compat.numpy
import scipy._external.array_api_compat.numpy.fft
import scipy._external.array_api_compat.numpy.linalg

import numpy.fft
import numpy.random
import numpy.linalg
import numpy._core
import numpy.ma
import numpy.polynomial
import numpy.lib

import pandas.core.arrays
import pandas.core.dtypes
import pandas.io.formats

import statsmodels.api
import statsmodels.formula.api
import statsmodels.regression
import statsmodels.tsa
import statsmodels.stats
